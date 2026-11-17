"""Read-only website checks, independent of migration reports and database credentials."""
import argparse, concurrent.futures, html.parser, json, urllib.error, urllib.parse, urllib.request

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base-url',default='http://127.0.0.1:8080')
BASE=parser.parse_args().base_url.rstrip('/')
def get(path):
    return urllib.request.urlopen(BASE+path,timeout=30)
def api(path,**params):
    with get('/api'+path+('?' + urllib.parse.urlencode(params) if params else '')) as r:return json.load(r)
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):return None
def media(path,optional=False):
    try:
        with urllib.request.build_opener(NoRedirect).open(BASE+path,timeout=30) as r:assert r.status==200
    except urllib.error.HTTPError as e:
        if optional and e.code==404:return
        assert e.code==302,(path,e.code)
        assert e.headers['Cache-Control']=='no-store'
        target=urllib.parse.urlparse(e.headers['Location'])
        assert target.scheme=='https' and 'x-oss-signature' in urllib.parse.parse_qs(target.query)
class Assets(html.parser.HTMLParser):
    def __init__(self):super().__init__();self.paths=set()
    def handle_starttag(self,tag,attributes):
        a=dict(attributes)
        path=a.get('src') if tag in ('script','img') else a.get('href') if tag=='link' and a.get('rel')=='stylesheet' else None
        if path and path.startswith('/') and not path.startswith('/api/'):self.paths.add(path)
with get('/') as r:
    document=r.read().decode('utf8');assert r.status==200
assets=Assets();assets.feed(document)
for path in assets.paths:
    with get(path) as r:assert r.status==200,path
categories=api('/categories');assert categories
videos=[]
page=0
while True:
    result=api('/videos',size=40,page=page,sort='sequence');videos+=result['items']
    if not result['hasMore']:break
    page+=1
assert videos and len({v['id'] for v in videos})==len(videos)
def check(video):
    vid=video['id']
    detail=api('/videos/'+vid);assert detail['video']['title']==video['title']
    assert all(v>=0 for v in api('/videos/'+vid+'/engagement').values())
    comments=api('/videos/'+vid+'/comments');assert len(comments['items'])<=2
    assert all(0<=d['timestamp']<video['duration'] for d in api('/videos/'+vid+'/danmaku'))
    collection=api('/videos/'+vid+'/collection')
    if collection['title']:assert any(v['id']==vid for v in collection['items'])
    media(video['coverUrl'],optional=True)
    if video['streamUrl']:media(video['streamUrl'],optional=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:list(pool.map(check,videos))
for uid in {v['authorId'] for v in videos}:
    assert api('/authors/'+uid)['id']==uid
    api('/authors/'+uid+'/collections');media('/api/authors/'+uid+'/avatar')
media('/api/avatar/default')
for term in ['小满','星河','晚风']:
    result=api('/search',q=term,size=20,userSort='followersDesc')
    assert result['totalUsers']>1 and all(term in u['name'] for u in result['users'])
    counts=[u['followers'] for u in result['users']];assert counts==sorted(counts,reverse=True)
first=api('/search',q='的',size=20,page=0);second=api('/search',q='的',size=20,page=1)
assert first['hasMore'] and not {u['id'] for u in first['users']} & {u['id'] for u in second['users']}
api('/ranks/weekly')
for path in ['/search?keyword=test','/popular/rank','/space/'+videos[0]['authorId'],'/video/'+videos[0]['id'],'/channel/'+categories[0]['id']]:
    with get(path) as r:assert r.status==200,path
print('PASS:',len(videos),'videos;',len(categories),'categories; assets, pages, details, comments, danmaku, collections, media signatures, authors, search sorting and pagination')
