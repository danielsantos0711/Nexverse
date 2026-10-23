-- Round 12: the newsroom scan reads every official source with a chosen window. Official feeds and pages that
-- were checked live and were missing from the list are added, so editors see and manage them with the rest.
insert into public.news_sources (kind, label, publisher, url, query, category_hint, desk, internal_only, enabled)
select v.kind, v.label, v.publisher, v.url, v.query, v.hint, v.desk, false, true
from (values
  ('site', 'xAI news', 'xAI', 'https://x.ai/news', '/news/', 'launch', 'launch'),
  ('rss', 'Amazon Science', 'Amazon Science', 'https://www.amazon.science/index.rss', null, 'research', 'research'),
  ('rss', 'Together AI blog', 'Together AI', 'https://www.together.ai/blog/rss.xml', null, 'tools', 'tools')
) as v(kind, label, publisher, url, query, hint, desk)
where not exists (select 1 from public.news_sources s where s.url = v.url);
