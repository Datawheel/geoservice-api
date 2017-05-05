import {version} from "../../package.json";
import {Router} from "express";
import levels from "../../db/levels.json";


export default ({config, db}) => {
  console.log(config, db);
  const api = new Router();

  api.get("/", (req, httpResult) => {
    httpResult.json({version});
  });

  api.get("/test", (req, httpResult) => {
    db.query("SELECT * from jonathan_test;").then((results, error) => {
      httpResult.json({results, error});
    });
  });

  api.get("/neighbors/:geoId", (req, httpResult) => {
    const geoId = req.params.geoId;
    const level = req.query.level || "county";

    if (!(level in levels)) {
      httpResult.status(404).json({status: "No such level", level});
    }

    const targetTable = `${levels[level].schema}.${levels[level].table}`;

    console.log(level, levels);

    const qry = `SELECT * from ${targetTable} s1,
              ${targetTable} s2
              WHERE ST_Touches(s1.geom, s2.geom)
              AND s1.geoid = $1
              LIMIT 10;`;
              console.log(qry);
    db.query(qry, geoId)
    .then((results, error) => {
      httpResult.json({results, error});
    });
  });

  api.get("/:intersects/:geo", (req, httpResult) => {
    console.log(req, httpResult);
    return {req, httpResult};
  });

  api.get("/:contains/:geo", (req, httpResult) => {
    console.log(req, httpResult);
    return {req, httpResult};
  });

  return api;
};
