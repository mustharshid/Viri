To compile and Git Push everything


npm run --prefix pwa build && cp -R pwa/dist/assets public/viri/ && cp pwa/dist/index.html public/viri/ && zip -r public/extention/viri-connect.zip extension -x "extension/tests/*" "extension/.DS_Store" && zip -r "ViRi extension.zip" extension -x "extension/tests/*" "extension/.DS_Store" && git add . && git commit -m "build: compile assets, package extension, and deploy" && git push

Without ZIPs:

npm run --prefix pwa build && cp -R pwa/dist/assets public/viri/ && cp pwa/dist/index.html public/viri/ && git add . && git commit -m "build: compile assets, package extension, and deploy" && git push