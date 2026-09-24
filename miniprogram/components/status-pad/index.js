const navChrome = require('../../utils/navChrome');

Component({
  data: {
    statusBarPx: 20,
  },
  lifetimes: {
    attached() {
      var m = navChrome.measureNavChrome();
      this.setData({ statusBarPx: m.statusBarPx });
    },
  },
});
