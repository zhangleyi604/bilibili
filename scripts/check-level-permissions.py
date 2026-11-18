"""Audit classroom data against the supplied Lv0/Lv1/Lv2 permission matrix."""
import argparse, collections, datetime, json, os, pathlib, subprocess, sys, xml.etree.ElementTree as ET

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.stdout.reconfigure(encoding='utf8')
config={}
for line in (ROOT/'.local/application.properties').read_text(encoding='utf-8-sig').splitlines():
    if '=' in line and not line.lstrip().startswith(('#','!')):
        k,v=line.split('=',1);config[k.strip()]=v.strip()
ENV=dict(os.environ,MYSQL_PWD=config['spring.datasource.password'])
def query(sql):
    p=subprocess.run(['mysql','--default-character-set=utf8mb4','--connect-timeout=5','-u',config['spring.datasource.username'],'-D','bilibili','--xml'],input=sql,capture_output=True,text=True,encoding='utf8',env=ENV)
    if p.returncode:raise RuntimeError(p.stderr)
    tree=ET.fromstring('<results>'+p.stdout.replace('<?xml version="1.0"?>','')+'</results>')
    return [{f.attrib['name']:f.text for f in row} for row in tree.findall('.//row')]

# System-created default favorites and positive coin rewards are not user actions.
RULES=[('弹幕','danmakutable','UID',2,'1'),('评论','commenttable','UID',2,'1'),('回复','replytable','UID',2,'1'),('视频投稿','videotable','UID',2,"t.VideoStatus='published'"),('合集','compilationtable','UID',2,'1'),('点赞','liketable','UID',1,'1'),('投币','coinrecordtable','UID',1,'t.CoinChange<0 AND t.VideoID IS NOT NULL'),('转发','forwardtable','UID',1,'1'),('订阅','subscriptionsummarytable','UID',1,'1'),('拉黑','relationtable','UID',1,'t.RelationType=1'),('举报','reporttable','UID',1,'1'),('充电','chargetable','UID',2,'1'),('发送私信','privatemessagetable','SenderUID',1,'1'),('接收私信','privatemessagetable','ReceiverUID',1,'1'),('系统通知','systemnotificationtable','ReceiverUID',1,'1'),('自建收藏夹','favourittable','UID',1,"t.FavoriteName<>'默认收藏夹'")]
def audit():
    counts={}
    for name,table,actor,minimum,condition in RULES:
        counts[name]=int(query(f"SELECT COUNT(*) n FROM {table} t JOIN usertable u ON u.UID=t.{actor} JOIN userleveltable l ON l.LevelID=u.LevelID WHERE CAST(SUBSTRING(l.LevelName,3) AS UNSIGNED)<{minimum} AND ({condition})")[0]['n'])
    counts['收藏']=int(query('SELECT COUNT(*) n FROM collectvideotable t JOIN favourittable f ON f.FavouritID=t.FavouritID JOIN usertable u ON u.UID=f.UID JOIN userleveltable l ON l.LevelID=u.LevelID WHERE l.LevelName=\'Lv0\'')[0]['n'])
    return counts

def repair():
    before=audit()
    supported={'弹幕','评论','回复','点赞','投币','转发','订阅','自建收藏夹','收藏'}
    if any(n for name,n in before.items() if name not in supported):raise RuntimeError('Additional violations require review; no changes applied.')
    users=query('SELECT u.UID,u.LevelID,u.AccountStatus,l.LevelName FROM usertable u JOIN userleveltable l ON l.LevelID=u.LevelID ORDER BY u.UID')
    levels={int(u['UID']):int(u['LevelName'][2:]) for u in users}
    eligible={n:[int(u['UID']) for u in users if int(u['LevelName'][2:])>=n and u['AccountStatus']=='active'] for n in (1,2)}
    sql=['SET NAMES utf8mb4;','START TRANSACTION;','SELECT UID FROM usertable FOR UPDATE;']
    changed=collections.Counter()
    for table,key,minimum in [('danmakutable','DanmakuID',2),('commenttable','CommentID',2),('replytable','ReplyID',2)]:
        for row in query(f'SELECT {key},UID FROM {table} ORDER BY {key}'):
            if levels[int(row['UID'])]<minimum:
                actor=eligible[minimum][int(row[key])%len(eligible[minimum])]
                sql.append(f'UPDATE {table} SET UID={actor} WHERE {key}={row[key]};')
                changed[table]+=1
    # For composite primary keys choose an unoccupied permitted actor, preserving row counts.
    for table,keys in [('liketable',['LikeTargetID','LikeTargetType']),('forwardtable',['VideoID']),('subscriptionsummarytable',['CollectionID'])]:
        rows=query('SELECT * FROM '+table)
        occupied=collections.defaultdict(set)
        for row in rows:
            if levels[int(row['UID'])]>=1:occupied[tuple(row[k] for k in keys)].add(int(row['UID']))
        for row in rows:
            if levels[int(row['UID'])]>=1:continue
            group=tuple(row[k] for k in keys)
            actor=next((u for u in eligible[1] if u not in occupied[group]),None)
            if actor is None:raise RuntimeError('Insufficient permitted actors for '+table)
            occupied[group].add(actor)
            where=' AND '.join(f'{k}={row[k]}' for k in ['UID']+keys)
            sql.append(f'UPDATE {table} SET UID={actor} WHERE {where};')
            changed[table]+=1
    folders=query('SELECT FavouritID,UID FROM favourittable ORDER BY FavouritID')
    folder_owner={int(f['FavouritID']):int(f['UID']) for f in folders}
    own_folder={}
    for f in folders:
        if int(f['UID']) in eligible[1]:own_folder.setdefault(int(f['UID']),int(f['FavouritID']))
    rows=query('SELECT VideoID,FavouritID FROM collectvideotable ORDER BY VideoID,FavouritID')
    occupied=collections.defaultdict(set)
    for row in rows:
        if levels[folder_owner[int(row['FavouritID'])]]>=1:occupied[row['VideoID']].add(int(row['FavouritID']))
    for row in rows:
        if levels[folder_owner[int(row['FavouritID'])]]>=1:continue
        folder=next((f for u,f in own_folder.items() if f not in occupied[row['VideoID']]),None)
        if folder is None:raise RuntimeError('Insufficient permitted favorites')
        occupied[row['VideoID']].add(folder)
        sql.append(f"UPDATE collectvideotable SET FavouritID={folder} WHERE VideoID={row['VideoID']} AND FavouritID={row['FavouritID']};")
        changed['collectvideotable']+=1
    # Only empty custom folders owned by Lv0 are removed; system default folders remain.
    custom=query("SELECT f.FavouritID FROM favourittable f JOIN usertable u ON u.UID=f.UID JOIN userleveltable l ON l.LevelID=u.LevelID WHERE l.LevelName='Lv0' AND f.FavoriteName<>'默认收藏夹'")
    if custom:sql.append('DELETE FROM favourittable WHERE FavouritID IN('+','.join(r['FavouritID'] for r in custom)+');')
    owners={r['VideoID']:int(r['UID']) for r in query('SELECT VideoID,UID FROM videotable')}
    spent=collections.defaultdict(int)
    # Also correct overlapping fixture donations beyond the procedure's two-coin lifetime cap.
    for row in query('SELECT CoinRecordID,UID,VideoID,CoinChange FROM coinrecordtable WHERE CoinChange<0 AND VideoID IS NOT NULL ORDER BY CoinRecordID'):
        amount=-float(row['CoinChange'])
        if amount not in (1,2):raise RuntimeError('Unexpected coin amount requires review')
        amount=int(amount);uid=int(row['UID']);vid=row['VideoID']
        if levels[uid]>=1 and uid!=owners[vid] and spent[(uid,vid)]+amount<=2:
            spent[(uid,vid)]+=amount;continue
        actor=next((u for u in eligible[1] if u!=owners[vid] and spent[(u,vid)]+amount<=2),None)
        if actor is None:raise RuntimeError('Insufficient coin capacity')
        spent[(actor,vid)]+=amount
        sql.append(f"UPDATE coinrecordtable SET UID={actor} WHERE CoinRecordID={row['CoinRecordID']};")
        changed['coinrecordtable']+=1
    sql.append('COMMIT;')
    directory=ROOT/'target'/'permission-repair';directory.mkdir(parents=True,exist_ok=True)
    backup=directory/('before-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S')+'.sql')
    with backup.open('wb') as out:
        p=subprocess.run(['mysqldump','--default-character-set=utf8mb4','--single-transaction','--routines','--triggers','--skip-lock-tables','-u',config['spring.datasource.username'],'bilibili'],stdout=out,stderr=subprocess.PIPE,env=ENV)
    if p.returncode or backup.stat().st_size<1000:raise RuntimeError('Backup failed; no changes applied')
    video_before=query('SELECT VideoID,UID,VideoTitle,VideoContent,CoverUrl,VideoDuration,CompilationID FROM videotable ORDER BY VideoID')
    tables=['danmakutable','commenttable','replytable','liketable','coinrecordtable','forwardtable','subscriptionsummarytable','collectvideotable']
    counts_before={t:query('SELECT COUNT(*) n FROM '+t)[0]['n'] for t in tables}
    (directory/'repair.sql').write_text('\n'.join(sql),encoding='utf8')
    query('\n'.join(sql))
    after=audit()
    assert not any(after.values()),after
    assert users==query('SELECT u.UID,u.LevelID,u.AccountStatus,l.LevelName FROM usertable u JOIN userleveltable l ON l.LevelID=u.LevelID ORDER BY u.UID')
    assert video_before==query('SELECT VideoID,UID,VideoTitle,VideoContent,CoverUrl,VideoDuration,CompilationID FROM videotable ORDER BY VideoID')
    assert counts_before=={t:query('SELECT COUNT(*) n FROM '+t)[0]['n'] for t in tables}
    assert not query('SELECT UID,VideoID FROM coinrecordtable WHERE CoinChange<0 AND VideoID IS NOT NULL GROUP BY UID,VideoID HAVING SUM(-CoinChange)>2')
    report={'before':before,'after':after,'reassigned':dict(changed),'backup':str(backup.relative_to(ROOT)),'verified':'Levels, video metadata and action counts preserved; coin cap checked.'}
    (directory/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--repair',action='store_true');args=parser.parse_args()
    if args.repair:repair()
    else:
        result=audit();print(json.dumps(result,ensure_ascii=False,indent=2));sys.exit(1 if any(result.values()) else 0)
