# Build stage: compila TypeScript -> JavaScript.
FROM mcr.microsoft.com/playwright:v1.62.1-noble AS build
WORKDIR /app

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime stage: somente dependências de produção + artefatos compilados.
FROM mcr.microsoft.com/playwright:v1.62.1-noble
WORKDIR /app

ENV NODE_ENV=production
ENV APP_VERSION=3.0.0
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist

ENTRYPOINT ["node", "dist/src/index.js"]
