const meta = document.createElement("meta");
meta.name = "viewport";
meta.content = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no";
document.head.appendChild(meta);

const link = document.createElement("link");
link.rel = "stylesheet";
link.href = "https://fonts.googleapis.com/icon?family=Material+Icons";
document.head.appendChild(link);

const supabaseScript = document.createElement("script");
supabaseScript.src = "scripts/supabase.js";
document.head.appendChild(supabaseScript);

const pageName = window.location.pathname.split("/").pop().replace(".html", "") || "index";

if (pageName !== "login") {
    const headerScript = document.createElement("script");
    headerScript.src = "scripts/header.js";
    document.head.appendChild(headerScript);
}

const mainCss = document.createElement("link");
mainCss.rel = "stylesheet";
mainCss.href = `css/main.css`;
document.head.appendChild(mainCss);

const pageCss = document.createElement("link");
pageCss.rel = "stylesheet";
pageCss.href = `css/${pageName}.css`;
document.head.appendChild(pageCss);

const pageJs = document.createElement("script");
pageJs.src = `scripts/${pageName}.js`;
document.head.appendChild(pageJs);