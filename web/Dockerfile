FROM oven/bun:1 AS builder

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

ARG VITE_REACT_APP_VERSION=dev
ENV DISABLE_ESLINT_PLUGIN=true
RUN VITE_REACT_APP_VERSION=${VITE_REACT_APP_VERSION} bun run build

FROM nginx:1.27-alpine AS runner

ENV BACKEND_ORIGIN=

COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --chmod=755 docker/docker-entrypoint.sh /docker-entrypoint.d/40-render-proxy-config.sh
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
