export default {
  collapse(c: { siteId: string; version: number }[]) {
    return c.reduce((l, r) => {
      l[r.siteId] = r.version.toString();
      return l;
    }, {});
  },
};
