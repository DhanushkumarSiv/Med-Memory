FROM node:20-alpine

WORKDIR /app

COPY code/server/package*.json ./
RUN npm ci

COPY code/server ./

EXPOSE 3001

CMD ["npm", "run", "dev"]
