# starting point: an image of node-10
FROM node:12-alpine

# create the app directory inside the image and use it as root from now on
WORKDIR /usr/src/app

# install app dependencies from the files package.json and package-lock.json
# installing before transfering the app files allows us to take advantage of cached Docker layers
COPY package*.json ./
# RUN npm install

# If you are building your code for production
RUN npm ci

# transfer the app codebase files to the root directory of the app
COPY ./ ./

# build the app
RUN npm run build

# expose the app port
EXPOSE 8080

# start the app on image startup
CMD ["npm", "run", "start"]