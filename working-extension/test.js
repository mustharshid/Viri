const cookies = [{ domain: ".bankofmaldives.com.mv", path: "/", secure: true, name: "blaze_session" }];
for (const cookie of cookies) {
    const protocol = cookie.secure ? "https://" : "http://";
    const cleanDomain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
    console.log(`${protocol}${cleanDomain}${cookie.path}`);
}
