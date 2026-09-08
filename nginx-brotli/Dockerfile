FROM nginx:1.28.3-alpine

# Brotli dynamic modules for nginx 1.28.3 (LTS), extracted from the Alpine
# nginx-mod-http-brotli apk (built for nginx=1.28.3-r7; same-version ABI as the
# image's nginx 1.28.3-r1). Uses China apk mirror.
RUN sed -i 's#dl-cdn.alpinelinux.org#mirrors.aliyun.com#g' /etc/apk/repositories \
 && apk update -q \
 && mkdir -p /tmp/bp && cd /tmp/bp \
 && apk fetch --no-cache nginx-mod-http-brotli \
 && tar -xzf nginx-mod-http-brotli-*.apk \
 && cp /tmp/bp/usr/lib/nginx/modules/*brotli*.so /usr/lib/nginx/modules/ \
 && rm -rf /tmp/bp

RUN printf 'load_module /usr/lib/nginx/modules/ngx_http_brotli_filter_module.so;\nload_module /usr/lib/nginx/modules/ngx_http_brotli_static_module.so;\n' \
    | cat - /etc/nginx/nginx.conf > /tmp/nc && mv /tmp/nc /etc/nginx/nginx.conf

RUN nginx -t 2>&1 | head -3