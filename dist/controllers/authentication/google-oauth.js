// const passport = require("passport");
// const GoogleStrategy = require("passport-google-oauth20").Strategy;
// passport.use(
//   new GoogleStrategy(
//     {
//       clientID: process.env.GOOGLE_CLIENT_ID,
//       clientSecret: process.env.GOOGLE_CLIENT_SECRET,
//       callbackURL: "/auth/google/callback",
//     },
//     function (
//       accessToken: string,
//       refreshToken: string,
//       profile?: any,
//       cb?: (_?: any, profile?: any) => {}
//     ) {
//       // Find or create user based on profile data
//       return cb(null, profile);
//     }
//   )
// );
// // Serialize/deserialize user
// passport.serializeUser((user?: {} | any, done?: any) => {
//   done(null, user);
// });
// passport.deserializeUser((obj?: any, done?: any) => {
//   done(null, obj);
// });
//# sourceMappingURL=google-oauth.js.map