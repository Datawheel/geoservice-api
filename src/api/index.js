import {Router} from "express";

import levels from "config/levels.json";
import {version} from "package";

export default ({db}) => {
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

    const qry = `SELECT * from ${targetTable} s1,
              ${targetTable} s2
              WHERE ST_Touches(s1.geom, s2.geom)
              AND s1.geoid = $1;`;

    db.query(qry, geoId).then((results, error) => {
      httpResult.json({results, error});
    });
  });

  api.get("/within", (req, httpResult) => {
    const geoId = req.query.target;
    const level1 = req.query.targetLevel || "county";
    const level2 = req.query.searchLevel || "place";

    const targetTable1 = `${levels[level1].schema}.${levels[level1].table}`;
    const targetTable2 = `${levels[level2].schema}.${levels[level2].table}`;
    const targetId1 = levels[level1].id;

    const qry = `SELECT * from ${targetTable1} s1,
              ${targetTable2} s2
              WHERE ST_Within(s1.geom, s2.geom)
              AND s1.${targetId1} = $1;`;

    db.query(qry, geoId)
    .then((results, error) => {
      httpResult.json({results, error});
    });
  });

  api.get("/intersects/:geoId", (req, httpResult) => {
    console.log(req, httpResult);
    return {req, httpResult};
  });

  return api;
};
