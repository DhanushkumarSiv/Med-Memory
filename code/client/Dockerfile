FROM node:20-alpine

WORKDIR /app

COPY code/client/package*.json ./
RUN npm ci

COPY code/client ./

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
