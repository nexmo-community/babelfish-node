const tracker = function() {
  this.languages = {};
};

tracker.prototype.add = function(number, from, to) {
  number = number.toString();
  this.languages[number] = { from, to };
};

tracker.prototype.remove = function(number) {
  number = number.toString();
  delete this.languages[number];
};

tracker.prototype.get = function(number) {
  number = number.toString();
  const lang = this.languages[number];
  if (!lang) {
    return { from: "en-US", to: "es" };
  }

  return lang;
};

module.exports = tracker;
