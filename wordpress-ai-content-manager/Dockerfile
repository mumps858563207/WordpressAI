FROM node:22-alpine
LABEL "language"="nodejs"
LABEL "framework"="vite"

WORKDIR /src

ENV NODE_ENV=production
ENV PORT=8080

RUN npm install -g pnpm

# 复制 package.json
COPY package*.json ./

# 安装依赖
RUN pnpm install

# 复制所有源代码
COPY . .

# 构建前端
RUN pnpm run build

# 编译 server.ts
RUN npx tsc server.ts --module esnext --target esnext --moduleResolution node --esModuleInterop --skipLibCheck --resolveJsonModule --outDir dist

EXPOSE 8080

CMD ["node", "dist/server.js"]
