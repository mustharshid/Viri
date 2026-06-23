const fs = require('fs');
const har = JSON.parse(fs.readFileSync('har.json', 'utf8'));

har.log.entries.forEach(entry => {
    if (entry.request.method === "POST" && entry.request.url.includes("/login")) {
        console.log("URL:", entry.request.url);
        console.log("POSTDATA keys:", entry.request.postData ? Object.keys(entry.request.postData) : "no postData");
        if (entry.request.postData) {
            console.log("MIME:", entry.request.postData.mimeType);
            console.log("TEXT:", entry.request.postData.text);
            console.log("PARAMS:", entry.request.postData.params);
        }
        console.log("-----------------------");
    }
});
