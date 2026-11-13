FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM caddy:2-alpine
COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
COPY start-caddy.sh /usr/local/bin/start-caddy
RUN sed -i 's/\r$//' /usr/local/bin/start-caddy && chmod +x /usr/local/bin/start-caddy
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/start-caddy"]
