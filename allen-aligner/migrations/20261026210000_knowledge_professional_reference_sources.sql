-- Refresh the source links in three curated draft articles and record the edits.
WITH prior AS (
  SELECT * FROM allen_kb_articles
  WHERE id IN (
    'a1111111-5300-4000-8000-000000000001',
    'a1111111-5300-4000-8000-000000000002',
    'a1111111-5300-4000-8000-000000000003'
  )
  FOR UPDATE
), changed AS (
  UPDATE allen_kb_articles AS article
  SET content = CASE article.id
      WHEN 'a1111111-5300-4000-8000-000000000001' THEN replace(
        article.content,
        E'\nAmerican Association of Orthodontists, Clinical Practice Guidelines: https://www.aaoinfo.org/practice-management/cpg/',
        ''
      )
      WHEN 'a1111111-5300-4000-8000-000000000002' THEN replace(
        article.content,
        'American Association of Orthodontists, Clinical Practice Guidelines: https://www.aaoinfo.org/practice-management/cpg/',
        'American Association of Orthodontists, Clear Aligners: https://aaoinfo.org/treatments/aligners/'
      )
      WHEN 'a1111111-5300-4000-8000-000000000003' THEN replace(
        article.content,
        E'\nAmerican Dental Association, Home Oral Care Recommendations: https://www.ada.org/-/media/project/ada-organization/ada/ada-org/files/resources/library/homeoralcare_web_final_july2018.pdf',
        ''
      )
      ELSE article.content
    END,
      version = article.version + 1,
      updated_by = 'SYSTEM',
      updated_at = now()
  FROM prior
  WHERE article.id = prior.id
    AND (
      article.content LIKE '%https://www.aaoinfo.org/practice-management/cpg/%'
      OR article.content LIKE '%https://www.ada.org/-/media/project/ada-organization/ada/ada-org/files/resources/library/homeoralcare_web_final_july2018.pdf%'
    )
  RETURNING article.*
)
INSERT INTO allen_kb_audit(article_id,actor_id,action,before_data,after_data)
SELECT changed.id,'SYSTEM','refresh_sources',to_jsonb(prior),to_jsonb(changed)
FROM changed JOIN prior ON prior.id=changed.id;
