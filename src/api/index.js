import {Router} from "express";

import {version} from "package";

import {levels} from "config/acs_levels";


const getTableForLevel = (level, mode = "shapes") => `${levels[mode][level].schema}.${levels[mode][level].table}`;

const getMetaForLevel = (level, mode = "shapes") => levels[mode][level];

const detectMode = level => {
  if (level in levels.shapes) {
    return "shapes";
  }
  else if (level in levels.points) {
    return "points";
  }
  return null;
};

const reverseLevelLookup = lvl => {
  const levelMap = {
    "tract": "140",
    "county": "050",
    "state": "040",
    "msa": "310",
    "place": "160",
    "zip": "860",
    "puma": "795",
    "school-district": "970"
  };
  return levelMap[lvl];
};


const levelLookup = geoId => {
  const prefix = geoId.slice(0, 3);
  const levelMap = {
    "140": "tract",
    "050": "county",
    "040": "state",
    "310": "msa",
    "160": "place",
    "860": "zip",
    "795": "puma",
    "970": "school-district"
  };
  return levelMap[prefix];
};


const groupByLevel = dataArr => {
  const result = {};
  dataArr.forEach(row => {
    // const geoId = row.geoid;
    // const myPrefix = geoId.slice(0, 3);
    const lvl = row.level;
    if (!Object.keys(result).includes(lvl)) {
      result[lvl] = [];
    }
    result[lvl].push(row);
  });
  return result;
};

export default ({db}) => {
  const api = new Router();

  api.get("/", (req, httpResult) => {
    httpResult.json({version});
  });


  api.get("/neighbors/:geoId", (req, httpResult) => {
    const geoId = req.params.geoId;
    const level = levelLookup(geoId);

    if (!(level in levels.shapes)) {
      httpResult.status(404).json({status: "No such level", level});
    }

    const targetTable = getTableForLevel(level);
    const myMeta = getMetaForLevel(level);
    const cols = myMeta.columns.map(x => `s2."${x}"`).join(",") || "*";

    const qry = `SELECT ${cols} from ${targetTable} s1,
              ${targetTable} s2
              WHERE ST_Touches(s1.geom, s2.geom)
              AND s1.geoid = $1;`;

    db.query(qry, geoId).then((results, error) => {
      httpResult.json({neighbors: results, error});
    });
  });

  // api.get("/:op(within|intersects)", (req, httpResult) => {
  //   const geoId = req.query.target;
  //   const gisCmd = req.params.op === "within" ? "ST_Within" : "ST_Intersects";
  //   const level1 = req.query.targetLevel || "county";
  //   const level2 = req.query.searchLevel || "place";
  //   const asTopo = req.query.asTopo;
  //
  //   const targetTable1 = `${levels[level1].schema}.${levels[level1].table}`;
  //   const targetTable2 = `${levels[level2].schema}.${levels[level2].table}`;
  //   const targetId1 = levels[level1].id;
  //   const intersectsFilter = gisCmd === "ST_Intersects" ? "AND (ST_Area(st_intersection(s2.geom, s1.geom)) / st_area(s1.geom)) > 0.01" : "";
  //   const qry = `SELECT s2.* from ${targetTable1} s1,
  //             ${targetTable2} s2
  //             WHERE ${gisCmd}(s2.geom, s1.geom)
  //             AND s1.${targetId1} = $1 ${intersectsFilter};`;
  //   db.query(qry, geoId)
  //   .then((results, error) => {
  //     if (asTopo) {
  //       topofy(results, httpResult);
  //     }
  //     else {
  //       httpResult.json({results, error});
  //     }
  //   });
  // });

  // api.get("/topojson/:level/:focusId", (req, httpResult) => {
  //   const level = req.params.level;
  //   const focusId = req.params.focusId;
  //
  //   if (!(level in levels)) {
  //     httpResult.status(404).json({status: "No such level", level});
  //   }
  //
  //   const levelSettings = levels[level];
  //
  //   console.log("LEVEL=", level);
  //   const quantization = parseFloat(req.query.quantization) || null;
  //
  //   const precision = 5;
  //   const hasParent = "parent" in levelSettings;
  //
  //   const tableRaw = levelSettings.displayTable ? levelSettings.displayTable : levelSettings.table;
  //   const targetTable = `${levelSettings.schema}."${tableRaw}"`;
  //
  //   // const includeParent = true;
  //
  //   let qry = `SELECT geoid, name, geom from ${targetTable} WHERE geoid=$1`;
  //   const qryGeom = `(SELECT geom from ${targetTable} WHERE geoid=$1)`;
  //
  //   if (hasParent) {
  //     const parentSettings = levels[levelSettings.parent];
  //     const parentRaw = parentSettings.displayTable ?  parentSettings.displayTable : parentSettings.table;
  //     const parentTable = `${parentSettings.schema}."${parentRaw}"`;
  //
  //     const filt = "allowedIds" in parentSettings ? `${parentSettings.id}
  //       IN (${parentSettings.allowedIds.map(x => `'${x}'`).join(",")})` : `geoid in (SELECT geoid FROM ${parentTable} pt WHERE ST_Within(${qryGeom}, pt.geom))`;
  //     qry = `SELECT geoid, name, geom from ${parentTable} WHERE ${filt} UNION ALL ${qry};`;
  //     console.log(qry);
  //   }
  //
  //   db.query(qry, focusId).then(data => {
  //     dbgeo.parse(data, {
  //       outputFormat: "topojson",
  //       precision,
  //       quantization
  //     }, (error, result) => {
  //       httpResult.json(result);
  //     });
  //   });
  // });

  api.get("/related/:geoId", (req, httpResult) => {
    const geoId = req.params.geoId || req.query.target;
    const level1 = levelLookup(geoId);
    const includeGeom = req.query.includeGeom ? ", s2.geom" : "";
    const targetTable1 = getTableForLevel(level1, "shapes");
    const targetId1 = getMetaForLevel(level1).id;

    const queries = [];
    const skipLevel = req.query.showAll === "true" ? [] : ["tract"];
    let stMode = "ST_Intersects";
    console.log("Here", req.query.stMode);

    if (req.query.stMode === "children") {
      stMode = "ST_Within";
    }
    else if (req.query.stMode === "parents") {
      stMode = "ST_Contains";
    }

    // Process related shapes
    const lvlsToProcess = Object.keys(levels.shapes).filter(lvl => !skipLevel.includes(lvl));
    lvlsToProcess.forEach(level => {
      if (level !== level1) {
        const targetTable2 = getTableForLevel(level, "shapes");
        const myMeta = getMetaForLevel(level);
        const nameColumn2 = myMeta.nameColumn || "name";
        const gidColumn2 = myMeta.geoColumn || "geoid";
        let qry;
        const specialCase = levels.simpleRelations[level1];
        if (specialCase && specialCase.levels.includes(level)) {
          const prefix = reverseLevelLookup(level);
          const testStr = `${prefix}${geoId.slice(3, specialCase.lengthToRetain)}`;
          console.log(testStr);
          qry = `SELECT s2."${gidColumn2}", s2."${nameColumn2}" as name, '${level}' as level ${includeGeom}
                 FROM
                 ${targetTable2} s2
                  WHERE s2.geoid LIKE '${testStr}%'`; // TODO SQL escaping
        }
        else {
          qry = `SELECT s2."${gidColumn2}", s2."${nameColumn2}" as name, '${level}' as level ${includeGeom} from ${targetTable1} s1,
                  ${targetTable2} s2
                  WHERE ${stMode}(s2.geom, s1.geom) AND NOT ST_Touches(s2.geom, s1.geom)
                  AND s1.${targetId1} = $1`;
        }

        queries.push(qry);
      }
    });

    // Process related points
    Object.keys(levels.points).forEach(level => {
      if (level !== level1) {
        const targetTable2 = getTableForLevel(level, "points");
        const myMeta = getMetaForLevel(level, "points");
        const nameColumn2 = myMeta.nameColumn || "name";
        const gidColumn2 = myMeta.id || "id";
        const qry = `SELECT s2."${gidColumn2}", s2."${nameColumn2}" as name, '${level}' as level ${includeGeom} from ${targetTable1} s1,
                  ${targetTable2} s2
                  WHERE ${stMode}(ST_SetSRID(ST_MakePoint(s2."lng", s2.lat), 4269), s1.geom)
                  AND s1.${targetId1} = $1`;
        queries.push(qry);
      }
    });

    Promise.all(queries.map(q => db.query(q, geoId)))
      .then(values => values.reduce((acc, x) => [...acc, ...x], []))
      .then(groupByLevel)
      .then(results => httpResult.json(results))
      .catch(error => {
        console.error("An error occured", error);
        httpResult.json({error});
      });

  });


  return api;
};
