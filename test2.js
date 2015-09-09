function matches(s) {
    if (s && /^[a-z0-9]+$/i.test(s)) {
        return true;
    } else {
        return false;
    }
}


console.log(matches(null));
console.log(matches());
console.log(matches("ab_"));
console.log(matches("Aab56"));

