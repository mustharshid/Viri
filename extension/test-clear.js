const domain = ".bankofmaldives.com.mv";
const cleanDomain = domain.startsWith('.') ? domain.substring(1) : domain;
console.log(cleanDomain);
