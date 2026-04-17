-- Enable PostGIS for spatial queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add geometry columns to routes
ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS start_point geography(POINT, 4326),
  ADD COLUMN IF NOT EXISTS route_line  geography(LINESTRING, 4326);

-- Spatial indexes for fast proximity queries
CREATE INDEX IF NOT EXISTS idx_routes_start_point ON routes USING GIST(start_point);
CREATE INDEX IF NOT EXISTS idx_routes_route_line  ON routes USING GIST(route_line);

-- RPC: store geometry after GPX upload
-- Called by client after parsing GPX coordinates
CREATE OR REPLACE FUNCTION update_route_geometry(
  route_id  uuid,
  start_wkt text,
  line_wkt  text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE routes SET
    start_point = ST_GeogFromText(start_wkt),
    route_line  = CASE
                    WHEN line_wkt IS NOT NULL THEN ST_GeogFromText(line_wkt)
                    ELSE route_line
                  END
  WHERE id = route_id
    AND author_id = auth.uid();
END;
$$;

-- RPC: clear geometry when GPX is removed
CREATE OR REPLACE FUNCTION clear_route_geometry(route_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE routes
  SET start_point = NULL, route_line = NULL
  WHERE id = route_id AND author_id = auth.uid();
END;
$$;

-- RPC: find routes near a location
-- Returns route IDs where route starts within radius OR passes through radius
CREATE OR REPLACE FUNCTION routes_near_location(
  lat       float8,
  lng       float8,
  radius_km float8 DEFAULT 50
)
RETURNS TABLE(id uuid)
LANGUAGE sql
STABLE
AS $$
  SELECT r.id
  FROM routes r
  WHERE
    (
      r.start_point IS NOT NULL
      AND ST_DWithin(r.start_point, ST_MakePoint(lng, lat)::geography, radius_km * 1000)
    )
    OR
    (
      r.route_line IS NOT NULL
      AND ST_DWithin(r.route_line, ST_MakePoint(lng, lat)::geography, radius_km * 1000)
    );
$$;
