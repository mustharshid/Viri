To compile and Git Push everything


npm run --prefix pwa build && cp -R pwa/dist/assets public/viri/ && cp pwa/dist/index.html public/viri/ && ./package-extension.sh && git add . && git commit -m "build: compile assets, package extension, and deploy" && git push

Without ZIPs:

npm run --prefix pwa build && cp -R pwa/dist/assets public/viri/ && cp pwa/dist/index.html public/viri/ && git add . && git commit -m "build: compile assets, package extension, and deploy" && git push

npm run --prefix pwa build && \
cp -R pwa/dist/assets public/viri/ && \
cp pwa/dist/index.html public/viri/ && \
git add . && \
git commit -m "feat: implement persistent BML API session and dashboard updates" && \
git push
