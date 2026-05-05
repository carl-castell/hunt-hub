ALTER TABLE "areas"
  ALTER COLUMN "geofile"
  SET DATA TYPE geometry(MultiPolygon, 4326)
  USING ST_Multi(ST_CollectionExtract("geofile", 3));
