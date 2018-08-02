Geospatial Service api
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
| mode | path | The desired relationships to find for the specified geospatial entity. Can be one of children, parents or intersects. Children will find only entities contained within the boundaries. Parents will find entities that contain the target entity and intersects will find any entity that intersect the entity in any way. | Yes | string |
| targetLevels | query | Comma separated list of desired geographic levels | No | string |
| overlapSize | query | Include a measure of the overlap size between geographic entities (should be used only as needed since it is slower to compute) | No | boolean (true/false) |
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
