/**
 * The public website (www.karoindia.in once the domain is live): marketing
 * pages, the blog, the privacy policy, robots.txt and sitemap.xml, rendered
 * by this server from MongoDB and edited by the Super Admin in the console.
 * docs/WEBSITE.md has the whole picture.
 *
 *   publicRouter         the site's paths (mounted before cors() in app.js)
 *   adminRouter          /api/site, the Super Admin's editor
 *   ensureSiteDefaults   the starter content, written once (at every start)
 */
module.exports = {
  get publicRouter() {
    return require('./public');
  },
  get adminRouter() {
    return require('./admin');
  },
  ensureSiteDefaults: (...args) => require('./defaults').ensureSiteDefaults(...args),
};
