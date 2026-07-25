To compile and Git Push everything


npm run --prefix pwa build && cp -R pwa/dist/* public/viri/ && ./package-extension.sh && git add . && git commit -m "build: compile assets, package extension, and deploy" && git push

Without ZIPs:

npm run --prefix pwa build && cp -R pwa/dist/* public/viri/ && git add . && git commit -m "build: compile assets, package extension, and deploy" && git push

npm run --prefix pwa build && \
cp -R pwa/dist/* public/viri/ && \
git add . && \
git commit -m "working on improvements" && \
git push

Commands to run when starting Laravel services and webserver:

php artisan serve & php artisan queue:work & php artisan schedule:work & npm run dev --prefix pwa

Simple command to git push
git add . && git commit -m "fix: resolve verify-terminal 500 error and array type checks" && git push
