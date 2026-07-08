FROM node:20-alpine AS builder

WORKDIR /usr/src/app

ARG VITE_API_BASE_URL=https://backend-730006147515.asia-southeast1.run.app
ARG VITE_GG_CLIENT_ID=730006147515-sgi4vb9lm0tjp6uu1335vgc9do6ef105.apps.googleusercontent.com
COPY package*.json ./
RUN npm ci
COPY . .

ENV NODE_OPTIONS=--max-old-space-size=4096

RUN if [ -n "$VITE_GG_CLIENT_ID" ]; then \
    VITE_API_BASE_URL="$VITE_API_BASE_URL" VITE_GG_CLIENT_ID="$VITE_GG_CLIENT_ID" npm run build; \
    else \
    VITE_API_BASE_URL="$VITE_API_BASE_URL" env -u VITE_GG_CLIENT_ID npm run build; \
    fi
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /usr/src/app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
