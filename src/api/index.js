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


const geoSpatialHelper = (stMode, geoId, skipLevel, overlapSize = false) => {
  const level1 = levelLookup(geoId);
  const targetTable1 = getTableForLevel(level1, "shapes");
  const targetId1 = getMetaForLevel(level1).id;

  const queries = [];

  if (stMode === "children") {
    stMode = "ST_Contains";
  }
  else if (stMode === "parents") {
    stMode = "ST_Within";
  }
  else {
    stMode = "ST_Intersects";
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
        // console.log(testStr);
        qry = `SELECT s2."${gidColumn2}", s2."${nameColumn2}" as name, '${level}' as level
               FROM
               ${targetTable2} s2
                WHERE s2.geoid LIKE '${testStr}%'`; // TODO SQL escaping
      }
      else {
        const overlapSizeQry = overlapSize ? ", ST_Area(ST_Intersection(s1.geom, s2.geom)) as overlap_size" : "";

        qry = `SELECT s2."${gidColumn2}", s2."${nameColumn2}" as name, '${level}' as level ${overlapSizeQry}
               FROM ${targetTable1} s1,
               ${targetTable2} s2
               WHERE ${stMode}(s1.geom, s2.geom) AND NOT ST_Touches(s1.geom, s2.geom) AND s1.${targetId1} = $1`;
      }

      queries.push(qry);
    }
  });

  // Process related points
  Object.keys(levels.points).forEach(level => {
    if (level !== level1 && !skipLevel.includes(level)) {
      const targetTable2 = getTableForLevel(level, "points");
      const myMeta = getMetaForLevel(level, "points");
      const nameColumn2 = myMeta.nameColumn || "name";
      const gidColumn2 = myMeta.id || "id";
      const qry = `SELECT s2."${gidColumn2}", s2."${nameColumn2}" as name, '${level}' as level from ${targetTable1} s1,
                ${targetTable2} s2
                WHERE ${stMode}(s1.geom, ST_SetSRID(ST_MakePoint(s2."lng", s2.lat), 4269))
                AND s1.${targetId1} = $1`;
      queries.push(qry);
    }
  });

  return queries;
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

  api.get("/relations/:mode(parents|children|intersects)/01000US", (req, httpResult) => {
    const nationVal = {geoid: "01000US", level: "nation", name: "United States", overlap_size: 1};
    httpResult.json([nationVal]);
  });

  api.get("/relations/:mode(parents|children|intersects)/:geoId", (req, httpResult) => {
    const geoId = req.params.geoId;
    const mode = req.params.mode;
    const skipLevel = req.query.showMore === "true" ? [] : ["puma", "university"];
    if (req.query.forceTracts !== "true") {
      skipLevel.push("tract");
    }

    const overlapSize = req.query.overlapSize === "true";
    const queries = geoSpatialHelper(mode, geoId, skipLevel, overlapSize);
    Promise.all(queries.map(q => db.query(q, geoId)))
      .then(values => values.reduce((acc, x) => [...acc, ...x], []))
      .then(dataArr => {
        if (mode !== "children") {
          const nationVal = {geoid: "01000US", level: "nation", name: "United States"};
          if (overlapSize) {
            nationVal.overlap_size = 1;
          }
          dataArr.splice(0, 0, nationVal);
        }
        return dataArr;
      })
      .then(results => httpResult.json(results))
      .catch(error => {
        console.error("An error occured", error);
        httpResult.json({error});
      });
  });

  return api;
};
