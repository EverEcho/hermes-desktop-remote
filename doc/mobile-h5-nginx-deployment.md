# H5 静态发布与 Nginx Gateway 代理

## 结论

- 开发环境：Vite 动态代理，用户可以填写任意 Gateway URL。
- 静态发布：推荐 Nginx 提供 H5，并为一个固定 Gateway 提供同源代理。
- 静态 Nginx 不建议根据用户输入动态代理任意 URL，这会把站点变成开放代理，存在 SSRF 风险。

生产环境建议让用户填写 Nginx 的代理地址，而不是内网 Gateway 原地址，例如：

```text
http://192.168.10.5:8080/gateway
```

## HTTP 局域网测试配置

假设：

- H5 构建目录：`/var/www/hermes-mobile`
- Gateway：`http://192.168.10.5:9119`
- Nginx 入口：`http://192.168.10.5:8080`

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

server {
    listen 8080;
    server_name 192.168.10.5;

    root /var/www/hermes-mobile;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # H5 使用 http://192.168.10.5:8080/gateway 作为 Gateway URL。
    location /gateway/ {
        proxy_pass http://192.168.10.5:9119/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        # 让上游 Cookie 对当前 H5 Host 生效。
        proxy_cookie_domain 192.168.10.5 $host;
        proxy_cookie_path / /gateway/;

        # 上游登录成功后跳回根路径时，回到 H5。
        proxy_redirect ~^https?://[^/]+/ /gateway/;
    }
}

```

如果 Gateway Cookie 没有设置 `Secure`，HTTP 局域网环境可以工作。若 Cookie 带 `Secure`，必须改用 HTTPS，或者仅在开发环境由后端关闭该标志。

## HTTPS 正式配置

正式环境将 `listen 8080` 改为 HTTPS，并保留同样的 `/gateway/` 代理。证书配置略。

```nginx
location /gateway/ {
    proxy_pass http://127.0.0.1:9119/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_cookie_path / /gateway/;
}
```

## H5 使用方式

静态发布时，输入 Nginx 代理地址：

```text
http://192.168.10.5:8080/gateway
```

不要输入：

```text
http://192.168.10.5:9119
```

前者保证登录、REST、Cookie 和 WebSocket 都处于同源代理下，避免 H5 跨域限制。

## 多 Gateway

如果必须让用户在静态 H5 中输入任意 Gateway URL，不能直接用普通 Nginx `proxy_pass` 动态转发。应增加受控后端代理：

1. 后端维护 Gateway allowlist。
2. H5 传递一个 Gateway ID，而不是任意 URL。
3. 后端根据 ID 选择上游并转发 REST/WebSocket。
4. 禁止代理到内网元数据地址、localhost 和未允许网段。

不建议使用 `$arg_target` 直接拼接 `proxy_pass`，否则会形成开放代理和 SSRF 漏洞。
