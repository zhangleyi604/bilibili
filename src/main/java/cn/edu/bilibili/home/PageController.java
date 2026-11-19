package cn.edu.bilibili.home;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
class PageController {
    @GetMapping({"/recommend", "/search", "/channel/{id}", "/popular", "/popular/must-watch", "/popular/rank", "/latest",
            "/video/{id}", "/space/{id}", "/service/{name}", "/collections", "/creators"})
    String page() {
        return "forward:/index.html";
    }
}
