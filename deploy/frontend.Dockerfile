FROM node:24-bookworm-slim AS frontend
RUN npm install --global pnpm@10.33.0 --force
WORKDIR /src/web
COPY web/package.json web/pnpm-lock.yaml ./
RUN --mount=type=secret,id=npmrc,required=true NPM_CONFIG_USERCONFIG=/run/secrets/npmrc pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build
FROM nginx:1.28-alpine
ARG CORE_UPSTREAM=api:8080
COPY --from=frontend /src/web/dist /usr/share/nginx/html
COPY deploy/frontend-nginx.conf /etc/nginx/nginx.conf
RUN case "$CORE_UPSTREAM" in ''|*[!a-zA-Z0-9._:-]*) exit 1;; esac \
    && sed -i "s#api:8080#${CORE_UPSTREAM}#g" /etc/nginx/nginx.conf
USER 101:101
EXPOSE 8080
HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=3 CMD ["wget", "-qO-", "http://127.0.0.1:8080/healthz"]
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
