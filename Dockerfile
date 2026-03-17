# ─── Stage 1: install dependencies ───────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --prefer-offline

# ─── Stage 2: build the Vite project ──────────────────────────────────────────
FROM deps AS build
COPY . .
RUN npm run build

# ─── Stage 3: serve the built output with nginx ───────────────────────────────
FROM nginx:1.27-alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
