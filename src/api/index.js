import {Router} from "express";

import levels from "config/levels.json";
import {version} from "package";
import dbgeo from "dbgeo";

function topofy(data, httpResult) {
  const precision = 5;
  const quantization = 100000;

  dbgeo.parse(data, {
    outputFormat: "topojson",
    precision,
    quantization
  }, (error, result) => {
    httpResult.json(result);
  });
}

const levelLookup = geoId => {
  const prefix = geoId.slice(0, 3);
  const levelMap = {
    "140": "tract",
    "050": "county",
    "040": "state",
    "160": "place",
    "860": "zip",
    "970": "school-district"
  };
  return levelMap[prefix];
};

export default ({db}) => {
  const api = new Router();

  api.get("/", (req, httpResult) => {
    httpResult.json({version});
  });

  // TODO add distance

  api.get("/neighbors/:geoId", (req, httpResult) => {
    const geoId = req.params.geoId;
    const level = levelLookup(geoId);

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

  api.get("/:op(within|intersects)", (req, httpResult) => {
    const geoId = req.query.target;
    const gisCmd = req.params.op === "within" ? "ST_Within" : "ST_Intersects";
    const level1 = req.query.targetLevel || "county";
    const level2 = req.query.searchLevel || "place";
    const asTopo = req.query.asTopo;

    const targetTable1 = `${levels[level1].schema}.${levels[level1].table}`;
    const targetTable2 = `${levels[level2].schema}.${levels[level2].table}`;
    const targetId1 = levels[level1].id;
    const intersectsFilter = gisCmd === "ST_Intersects" ? "AND (ST_Area(st_intersection(s2.geom, s1.geom)) / st_area(s1.geom)) > 0.01" : "";
    const qry = `SELECT s2.* from ${targetTable1} s1,
              ${targetTable2} s2
              WHERE ${gisCmd}(s2.geom, s1.geom)
              AND s1.${targetId1} = $1 ${intersectsFilter};`;
    db.query(qry, geoId)
    .then((results, error) => {
      if (asTopo) {
        topofy(results, httpResult);
      }
      else {
        httpResult.json({results, error});
      }
    });
  });

  api.get("/topojson/:level/:focusId", (req, httpResult) => {
    const level = req.params.level;
    const focusId = req.params.focusId;

    if (!(level in levels)) {
      httpResult.status(404).json({status: "No such level", level});
    }

    const levelSettings = levels[level];

    console.log("LEVEL=", level);
    const quantization = parseFloat(req.query.quantization) || null;

    const precision = 5;
    const hasParent = "parent" in levelSettings;


    const targetTable = `${levelSettings.schema}.${levelSettings.table}`;

    // const includeParent = true;

    let qry = `SELECT geoid, name, geom from ${targetTable} WHERE geoid=$1`;
    if (hasParent) {
      const parentSettings = levels[levelSettings.parent];
      const parentTable = `${parentSettings.schema}."${parentSettings.table}"`;

      const filt = "allowedIds" in parentSettings ? `${parentSettings.id}
        IN (${parentSettings.allowedIds.map(x => `'${x}'`).join(",")})` : false;
      qry = `SELECT geoid, name, geom from ${parentTable} WHERE ${filt} UNION ALL ${qry};`;
      console.log(qry);
    }

    db.query(qry, focusId).then(data => {
      dbgeo.parse(data, {
        outputFormat: "topojson",
        precision,
        quantization
      }, (error, result) => {
        httpResult.json(result);
      });
    });
  });

  api.get("/related", (req, httpResult) => {
    const geoId = req.query.target;
    // const gisCmd = req.params.op === "within" ? "ST_Within" : "ST_Intersects";
    const level1 = levelLookup(geoId);
    const includeGeom = req.query.includeGeom ? ", s2.geom" : "";

    const targetTable1 = `${levels[level1].schema}.${levels[level1].table}`;
    const targetId1 = levels[level1].id;
    const queries = [];

    Object.keys(levels).forEach(level => {
      const targetTable2 = `${levels[level].schema}.${levels[level].table}`;

      const qry = `SELECT s2.geoid, s2.name ${includeGeom} from ${targetTable1} s1,
                ${targetTable2} s2
                WHERE (ST_Area(st_intersection(s2.geom, s1.geom)) / st_area(s1.geom)) > 0.01
                AND s1.${targetId1} = $1`;
      queries.push(qry);
    });

    Promise.all(queries.map(q => db.query(q, geoId)))
      .then(values => values.reduce((acc, x) => [...acc, ...x], []))
      .then(results => topofy(results, httpResult))
      .catch(error => {
        console.error("An error occured", error);
        httpResult.json({error});
      });

  });


  return api;
};
