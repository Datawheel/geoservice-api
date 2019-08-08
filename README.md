Geospatial Service API
==================================

API for querying geospatial data

Required Environment variables:

|Environment Variable|Description|
|--|--|
|GSA_DB_NAME|Postgres Database name|
|GSA_DB_PW|Postgres Database Password|
|GSA_DB_USER|Postgres Database Username|
|GSA_DB_HOST|Postgres Database Host|
|GSA_DB_PORT|Postgres Database Port|
|GSA_USER_CONFIG_FILE| Absolute path to levels JSON configuration file _(optional)_|
|GSA_DEFAULT_SRID|Default SRID to use for point-based calculations. _(optional)_|
# API Usage

**Version:** 0.0.1

### /relations/{mode}/{geoId}
---
##### ***GET***
**Summary:** Find relationships to geoId based on the desired mode.

**Description:** Returns a list of related geospatial entities.

**Parameters**

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ---- |
| geoId | path | ID of geospatial entity of interest | Yes | string |
| mode | path | One of `parents`, `children`, `intersects`, or `distance`. The desired relationships to find for the specified geospatial entity. Can be one of children, parents or intersects. Children will find only entities contained within the boundaries. Parents will find entities that contain the target entity and intersects will find any entity that intersect the entity in any way. | Yes | string |
| targetLevels | query | Comma separated list of desired geographic levels | No | string |
| overlapSize | query | Include a measure of the overlap size between geographic entities (should be used only as needed since it is slower to compute) | No | boolean (true/false) |
| rangeKm | query | If mode is `distance` user must provide a value for range in kilometers for the distance search. | Only if `mode` is distance | integer |
**Responses**

| Code | Description |
| ---- | ----------- |
| 200 | successful operation |

### /coordinates
---
##### ***GET***
**Summary:** Find entities related to a given latitude/longitude.

**Description:** Returns a list of related geospatial entities.

**Parameters**

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ---- |
| latitude | query | Latitude of the search point | No | number |
| longitude | query | Longitude of the search point | No | number |

**Responses**

| Code | Description |
| ---- | ----------- |
| 200 | successful operation |

# Configuration File Format


## Shape level configurations
| Name | Description | Required | Type |
| ---- | ---------- | ----------- | -------- |
| schema | Name of schema that contains the table | No (defaults to "public") | String |
| table | Name of table that the geospatial table. This table must at least contain an ID column and a geometry column. | Yes | String |
| idColumn | Name of the identifier column for each row in the table. | Yes | String |
| nameColumn | Name of the display name column for each row in the table. | No | String |
| geometryColumn | Name of the geospatial geometry column for each row in the table. | No (defaults to "geometry") | String |
| parent | Name(s) of other levels which are immediate parents of the current level. | No | String or String[]|


Every entry in the `shapes` configuration object maps the name of a target shape level (e.g. "state", "county" etc.) to an object that contains the settings above. See the example below for usage reference.

## Example
At its most basic level, the configuration may consist of a list of `shapes` configuration items. For example:

```json
{
    "shapes": {
        "entity": {"schema": "public", "table": "inegi_geo_ent", "idColumn": "ent_id", "nameColumn": "ent_id"},
        "municipality": {"schema": "public", "table": "inegi_geo_mun", "idColumn": "mun_id", "parent": ["entity"], "nameColumn": "mun_id"},
        "locality": {"schema": "public", "table": "inegi_geo_loc", "idColumn": "loc_id", "parent": "municipality", "nameColumn": "loc_id"}
    },
```
