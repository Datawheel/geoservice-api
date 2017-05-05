import pgp from "pg-promise";
import dbConfig from "config/db";


const db = pgp({})(dbConfig.development);

export default callback => {
  // connect to a database if needed, then pass it to `callback`:
  callback(db);
};
