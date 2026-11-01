-- Better search. "sofa" should find "sofas", "fade" should find a barber that lists fades, and "furnished" should
-- find furnished flats. The document now holds both exact words (simple) and English stems, plus the listing's
-- own details (attributes) and its category name. Queries use prefix matching (see routes/public.ts).
CREATE OR REPLACE FUNCTION listings_search_doc() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  head text := unaccent(coalesce(NEW.title, ''));
  body text := unaccent(coalesce(NEW.subtype, '') || ' ' || coalesce(NEW.summary, '') || ' ' || replace(NEW.category::text, '_', ' '));
  more text := unaccent(coalesce(NEW.description, ''));
BEGIN
  NEW.search_doc :=
      setweight(to_tsvector('simple', head), 'A') || setweight(to_tsvector('english', head), 'A')
   || setweight(to_tsvector('simple', body), 'B') || setweight(to_tsvector('english', body), 'B')
   || setweight(to_tsvector('simple', more), 'C') || setweight(to_tsvector('english', more), 'C')
   || setweight(jsonb_to_tsvector('simple', coalesce(NEW.attributes, '{}'::jsonb), '["string"]'), 'C')
   || setweight(to_tsvector('simple', replace(array_to_string(coalesce(NEW.amenities, '{}'), ' '), '_', ' ')), 'D');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS listings_search_doc_trg ON listings;
CREATE TRIGGER listings_search_doc_trg BEFORE INSERT OR UPDATE OF title, subtype, summary, description, attributes, amenities, category
  ON listings FOR EACH ROW EXECUTE FUNCTION listings_search_doc();

-- Rebuild every document with the new recipe.
UPDATE listings SET title = title;
