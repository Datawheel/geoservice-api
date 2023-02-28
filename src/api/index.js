import {Router} from "express";

import {version} from "package";

import acsConfig from "config/acs_levels";

let userConfig = null;

const USER_CONFIG = process.env.GSA_USER_CONFIG_FILE;
const DEFAULT_SRID = (process.env.GSA_DEFAULT_SRID ? parseInt(process.env.GSA_DEFAULT_SRID, 10) : null) || 4326;

if (USER_CONFIG) {
  console.log("Trying user config file", USER_CONFIG);
  userConfig = require(USER_CONFIG);
  console.log("Using user config file", USER_CONFIG, userConfig);
}
else {
  console.log("Using default configuration:", acsConfig);
}

const levels = userConfig || acsConfig;


const getTableForLevel = (level, mode = "shapes") => `${levels[mode][level].schema}.${levels[mode][level].table}`;

const getMetaForLevel = (level, mode = "shapes") => levels[mode][level];


const defaultLevelLookup = geoId => {
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

/*
Given an idMapping dictionary, this function will return a function
which takes an geo item ID (e.g. 12345) maps it to the geo level that it represents (e.g. "state")
so that the appropriate SQL table can be queried.
*/
function buildLevelLookup(myLevels) {
  if (myLevels.idMapping !== undefined) {
    const myLenConditions = Object.keys(myLevels.idMapping).map(key => [key, myLevels.idMapping[key].maxLength]);
    return lvl => {
      for (let i = 0; i < myLenConditions.length; i++) {
        const item = myLenConditions[i];
        if (lvl.length <= item[1]) {
          return item[0];
        }
      }
      throw new Error("Bad level!");
    };
  }
  else {
    console.warn("No ID mapping specified");
  }
  return defaultLevelLookup;
}

const levelLookup = buildLevelLookup(levels);

/**
 *
 * @param {string or string[]} myMetaNextLevel - A string or list of strings representing possible parent or child levels
 * @param {Object} possibleLevelNames - A dictionary for storing the unique parents or children
 */
function addMeta(myMetaNextLevel, possibleLevelNames) {
  if (Array.isArray(myMetaNextLevel)) {
    myMetaNextLevel.forEach(pLvlName => possibleLevelNames[pLvlName] = true);
  }
  else if (myMetaNextLevel) {
    possibleLevelNames[myMetaNextLevel] = true;
  }
  return possibleLevelNames;
}

const geoSpatialHelper = (stMode, geoId, skipLevel,
  overlapSize = false, rangeKm = null, displayName = false) => {

  const level1 = levelLookup(geoId);
  const targetTable1 = getTableForLevel(level1, "shapes");
  const myMeta1 = getMetaForLevel(level1);
  const targetId1 = myMeta1.id || myMeta1.idColumn;
  const levelMode = stMode;
  const queries = [];
  let distParam = "";

  if (stMode === "children") {
    stMode = "ST_Contains";
  }
  else if (stMode === "parents") {
    stMode = "ST_Within";
  }
  else if (stMode === "distance") {
    stMode = "ST_DWithin";
    if (!rangeKm) {
      throw new Error("Distance endpoint must have rangeKm value");
    }
    if (!isNaN(rangeKm)) {
      rangeKm *= 1000;
    }
    else {
      throw new Error("rangeKm is not a number!");
    }
    distParam = `, ${rangeKm}`;
  }
  else {
    stMode = "ST_Intersects";
  }
  const filterCond = lvl => !skipLevel.includes(lvl);
  // Process related shapes
  const lvlsToProcess = Object.keys(levels.shapes).filter(filterCond);
  const geometryColumn1 = myMeta1.geometryColumn || "geometry";
  let possibleParents = null;
  if (levelMode === "parents" && myMeta1.parent) {
    possibleParents = {};
    addMeta(myMeta1.parent, possibleParents);
    Object.keys(possibleParents).forEach(parent => {
      const myMeta = getMetaForLevel(parent);
      addMeta(myMeta.parent, possibleParents);
    });
    possibleParents = Object.keys(possibleParents);
  }

  lvlsToProcess.forEach(level => {
    const skipParentCond = levelMode === "parents" && possibleParents && !possibleParents.includes(level);

    if (!skipParentCond && level !== level1 || stMode === "ST_DWithin") {
      const targetTable2 = getTableForLevel(level, "shapes");
      const myMeta = getMetaForLevel(level);
      const nameColumn2 = myMeta.nameColumn || "name";
      const gidColumn2 = myMeta.idColumn || "geoid";
      const geometryColumn2 = myMeta.geometryColumn || "geometry";
      const nameStr2 = displayName ? ` s2."${nameColumn2}" as name, ` : "";
      let qry;
      const specialCase = levels.simpleRelations && levels.simpleRelations[level1];
      if (specialCase && specialCase.levels.includes(level) && specialCase.mode === levelMode) {
        // const prefix = reverseLevelLookup(level);
        const testStr = `${geoId.slice(0, specialCase.lengthToRetain)}`;
        qry = {qry: `SELECT s2."${gidColumn2}" as geoid, ${nameStr2} '${level}' as level
               FROM ${targetTable2} s2
               WHERE CAST(s2."${gidColumn2}" as TEXT) LIKE $1`,
          params: [`${testStr}%`]};
      }
      else {
        const overlapSizeQry = overlapSize ? `, ST_Area(ST_Intersection(s1."${geometryColumn1}", s2."${geometryColumn2}")) as overlap_size` : "";
        const overlapFilterQry = "";
        qry = {qry: `SELECT s2."${gidColumn2}" as geoid, ${nameStr2} '${level}' as level ${overlapSizeQry}
               FROM ${targetTable1} s1,
               ${targetTable2} s2
               WHERE ${stMode}(s1."${geometryColumn1}", s2."${geometryColumn2}" ${distParam}) AND s1.${targetId1} = $1
                ${overlapFilterQry}`,
          params: [geoId]};
          
      }
      queries.push(qry);
    }
    
  });

  // Process related points
  if (levels.points) {
    Object.keys(levels.points).forEach(level => {
      if (level !== level1 && filterCond(level)) {
        const targetTable2 = getTableForLevel(level, "points");
        const myMeta = getMetaForLevel(level, "points");
        const nameColumn2 = myMeta.nameColumn || "name";
        const gidColumn2 = `${myMeta.id} as "id"` || "id";
        const nameStr2 = displayName ? ` s2."${nameColumn2}" as name, ` : "";
        const srid = myMeta.srid || DEFAULT_SRID;
        const qry = `SELECT s2."${gidColumn2}", ${nameStr2} '${level}' as level from ${targetTable1} s1,
                  ${targetTable2} s2
                  WHERE ${stMode}(s1."${geometryColumn1}", ST_SetSRID(ST_MakePoint(s2."lng", s2.lat), ${srid}) ${distParam})
                  AND s1.${targetId1} = $1`;
        queries.push({qry, params: [geoId]});
      }
    });
  }
  console.log(queries);
  return queries;
};

const pointFinderHelper = (lng, lat, skipLevel, displayName) => {
  const filterCond = lvl => !skipLevel.includes(lvl);
  const queries = [];
  // Process related boundaries
  const lvlsToProcess = Object.keys(levels.shapes).filter(filterCond);
  lvlsToProcess.forEach(level => {
    const targetTable2 = getTableForLevel(level, "shapes");
    const myMeta = getMetaForLevel(level);
    const srid = myMeta.srid || DEFAULT_SRID;
    const nameColumn2 = myMeta.nameColumn || "name";
    const gidColumn2 = myMeta.idColumn || "geoid";
    const geometryColumn2 = myMeta.geometryColumn || "geometry";

    const nameFinalStr2 = displayName ? `s2."${nameColumn2}" as name, ` : "";
    // Logic to put geometries into Lat/Long coordinates
    const pointXformLogic = `ST_Intersects(
      ST_TRANSFORM(ST_SetSRID(s2."${geometryColumn2}", $1), 4326),
      ST_SetSRID(ST_MakePoint($2,  $3), 4326)
   )`;

    const qry = `SELECT s2."${gidColumn2}" as geoid, ${nameFinalStr2} '${level}' as level
                 FROM ${targetTable2} s2
                 WHERE ${pointXformLogic}`;
    queries.push({qry, params: [srid, parseFloat(lng), parseFloat(lat)]});
  });

  return queries;
};

const getSkipLevels = req => {
  let skipLevel = [...Object.keys(levels.shapes).filter(lvl => getMetaForLevel(lvl).ignoreByDefault)];
  if (levels.points) {
    skipLevel = [...skipLevel, ...Object.keys(levels.points).filter(lvl => getMetaForLevel(lvl, "points").ignoreByDefault)];
  }
  let targetLevels = req.query.targetLevels;
  if (targetLevels) {
    targetLevels = targetLevels.split(",");
    const levelNames = [...Object.keys(levels.shapes), ...Object.keys(levels.points)];
    skipLevel = levelNames.filter(x => !targetLevels.includes(x));
  }
  return skipLevel;
};

export default ({db}) => {
  const api = new Router();

  api.get("/", (req, httpResult) => {
    httpResult.json({version});
  });

  api.get("/coordinates", (req, httpResult) => {
    const longitude = req.query.longitude;
    const latitude = req.query.latitude;
    if (!latitude || !longitude) {
      httpResult.status(400).send("Must specify latitude and longitude");
    }
    else {
      const skipLevel = getSkipLevels(req);
      console.log(skipLevel);
      const queries = pointFinderHelper(longitude, latitude, skipLevel);
      Promise.all(queries.map(raw => {
        const {qry, params} = raw;
        return db.query(qry, params);
      }))
        .then(values => values.reduce((acc, x) => [...acc, ...x], []))
        .then(results => httpResult.json(results))
        .catch(error => {
          console.error("An error occured", error);
          httpResult.json({error});
        });
    }
  });

  api.get("/neighbors/:geoId", (req, httpResult) => {
    const geoId = req.params.geoId;
    const level = levelLookup(geoId);
    const myMeta1 = getMetaForLevel(level);
    const geoIdColumn1 = myMeta1.idColumn || "geoid";
    const geometryColumn1 = myMeta1.geometryColumn || "geometry";

    if (!(level in levels.shapes)) {
      httpResult.status(404).json({status: "No such level", level});
    }

    const targetTable = getTableForLevel(level);
    // const myMeta = getMetaForLevel(level);

    const qry = `SELECT s2."${geoIdColumn1}" as geoid, '${level}' as level from ${targetTable} s1,
              ${targetTable} s2
              WHERE ST_Touches(s1."${geometryColumn1}", s2."${geometryColumn1}")
              AND s1."${geoIdColumn1}" = $1;`;
    db.query(qry, geoId).then((results, error) => {
      httpResult.json(!error ? results : error);
    }).catch(error => {
      console.error(error);
      httpResult.json([]);
    });
  });

  api.get("/relations/:mode(parents|children|intersects|distance)/:geoId", (req, httpResult) => {
    const geoId = req.params.geoId;
    const mode = req.params.mode;

    let skipLevel = [
      ...Object.keys(levels.shapes).filter(lvl => getMetaForLevel(lvl).ignoreByDefault)
    ];
  
    if (levels.points) {
      skipLevel = [...skipLevel, ...Object.keys(levels.points).filter(lvl => getMetaForLevel(lvl, "points").ignoreByDefault)];
    }

    let targetLevels = req.query.targetLevels;
    const rangeKm = req.query.rangeKm;

    if (targetLevels) {
      targetLevels = targetLevels.split(",");
      let levelNames = [...Object.keys(levels.shapes)];
      if (levels.points) {
        levelNames = [...levelNames, ...Object.keys(levels.points)];
      }
      skipLevel = levelNames.filter(x => !targetLevels.includes(x));
    }

    const overlapSize = req.query.overlapSize === "true";
    const displayName = req.query.displayName === "true";
    const queries = geoSpatialHelper(mode, geoId, skipLevel, overlapSize, rangeKm, displayName);
    Promise.all(queries.map(raw => {
      const {qry, params} = raw;
      return db.query(qry, params);
    }))
      .then(values => values.reduce((acc, x) => [...acc, ...x], []))
      .then(results => httpResult.json(results))
      .catch(error => {
        console.error("An error occured", error);
        httpResult.json({error});
      });
  });

  return api;
};
