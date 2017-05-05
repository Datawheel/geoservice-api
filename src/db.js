import pgp from "pg-promise";
import config from "../db/config";


const db = pgp({})(config.development);

export default callback => {
  // connect to a database if needed, then pass it to `callback`:
  callback(db);
};
