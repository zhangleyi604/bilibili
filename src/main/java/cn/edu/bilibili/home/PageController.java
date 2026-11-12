package cn.edu.bilibili.home;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
class PageController {
    @GetMapping({"/recommend", "/search", "/channel/{id}", "/popular", "/popular/rank", "/latest",
            "/video/{id}", "/space/{id}", "/service/{name}"})
    String page() {
        return "forward:/index.html";
    }
}
