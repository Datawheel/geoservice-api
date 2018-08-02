export default {
  shapes: {
    state: {schema: "shapes2017", table: "states", id: "geoid", parent: "state", columns: ["name", "geoid"], srid: 4269},
    county: {schema: "shapes2017", table: "counties", id: "geoid", parent: "state", columns: ["name", "geoid"], nameColumn: "namelsad", srid: 4269},
    place: {schema: "shapes2017", table: "places", id: "geoid", parent: "county", columns: ["name", "geoid"], srid: 4269},
    tract: {schema: "shapes2017", table: "tracts", id: "geoid", parent: "county", columns: ["name", "geoid"], nameColumn: "namelsad", srid: 4269, ignoreByDefault: true},
    msa: {schema: "shapes2017", table: "msas", id: "geoid", parent: "state", columns: ["name", "geoid"], srid: 4269},
    puma: {schema: "shapes2017", table: "pumas", id: "geoid", parent: "state", columns: ["name", "geoid"], srid: 4269, ignoreByDefault: true, nameColumn: "namelsad10"},
    zip: {schema: "shapes2017", table: "zips", id: "geoid", parent: "state", columns: ["zcta5ce10", "geoid"], srid: 4269, ignoreByDefault: false}
  },
  points: {
  },
  simpleRelations: {
    state: {
      lengthToRetain: 9,
      levels: ["county", "tract", "puma"],
      mode: "children"
    },
    county: {
      lengthToRetain: 12,
      levels: ["tract"],
      mode: "children"
    }
  }
};
