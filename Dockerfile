# Cloud quiz: default presenter image, or --target screen for public projection.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

# Public projection image contains only the display assets and read-only gateway.
FROM node:24-slim AS screen
ENV NODE_ENV=production \
    PORT=8080
WORKDIR /app
COPY --from=build /app/cloud/screen-server.mjs ./cloud/screen-server.mjs
COPY --from=build /app/dist/cloud/screen.html ./dist/cloud/screen.html
COPY --from=build /app/dist/cloud/screen.js ./dist/cloud/screen.js
COPY --from=build /app/dist/cloud/prize-data.json ./dist/cloud/prize-data.json
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "cloud/screen-server.mjs"]

# The final stage is the authenticated presenter service.
FROM node:24-slim AS presenter
ENV NODE_ENV=production \
    PORT=8080
WORKDIR /app
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/cloud ./cloud
COPY --from=build /app/web/src/quiz ./web/src/quiz
COPY --from=build /app/dist/cloud ./dist/cloud
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "cloud/server.mjs"]
