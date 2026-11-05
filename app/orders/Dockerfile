# Stage A: install production dependencies
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Stage B: final small image
FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json server.js ./
# Run as the non-root "node" user that ships with the image
USER node
EXPOSE 3000
# Start node directly (not npm) so shutdown signals reach the app
CMD ["node", "server.js"]
