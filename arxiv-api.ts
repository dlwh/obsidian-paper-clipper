/* Broadly based on https://github.com/eliorav/arXiv-api/blob/master/src/index.js
but typescript and no known security issues */

const xml2js = require('xml2js');

type SortOrder = 'ascending' | 'descending';
type SortBy = 'relevance'|'lastUpdatedDate'|'submittedDate';


interface ArxivSearchParams {
  query: string;
  sortBy?: SortBy;
  sortOrder?: SortOrder;
  max_results?: number;
  start?: number;
}

export const arxiv_search_url = ({query, sortBy, sortOrder, max_results, start}: ArxivSearchParams) =>
    `https://export.arxiv.org/api/query?search_query=${query}&start=${start || 0}&max_results=${max_results || 10}${
        sortBy ? `&sortBy=${sortBy}` : ''
    }${sortOrder ? `&sortOrder=${sortOrder}` : ''}`;


interface RawArticle {
  id: string,
  updated: string,
  published: string,
  title: string,
  summary: string,
  author: RawAuthor[],
  link: RawLink[],
}

interface RawAuthor {
  name: string,
}

interface RawLink {
  "$": {
    href: string,
    rel: string,
    type: string,
    title?: string
  },
}

export interface Article {
  id: string,
  updated: Date,
  published: Date,
  title: string,
  abstract: string,
  authors: string[],
  pdf?: string,
}

function maybe_wrap<T>(obj: T | T[] | undefined): T[]|undefined {
  if (obj === undefined) {
    return undefined;
  } else if (Array.isArray(obj)) {
    return obj;
  } else {
    return [obj];
  }
}

export const search_for_articles_by_id: (id: string) => Promise<Article[]> = async (id: string) => {
  const response = await fetch(arxiv_search_url({query: `id:${id}`}));
  // response is an atom feed. want to get the 0th entry
  const feed = await response.text();
  const json = await xml2js.parseStringPromise(feed, {explicitArray: false});
  console.log(id);
  console.log(json);
  const entry = maybe_wrap(json.feed.entry) as RawArticle[];
  if (entry === undefined) {
    return [];
  }
  console.log(entry)
  const articles = entry.map(article_from_raw);
  console.log(articles)
  return articles
};

export function extract_arxiv_id_from_url(query: string, keep_version: boolean): string|undefined {
  const id_match = query.match(/^https?:\/\/(?:www\.|export\.)?arxiv\.org\/(?:abs|pdf)\/([0-9.]+)[^.]*(?:\.pdf)?$/);
  if (id_match) {
    if (!keep_version) {
      return id_match[1].split('v')[0];
    }
    return id_match[1];
  }
}

function article_from_raw(raw: RawArticle): Article {
  const authors = maybe_wrap(raw.author).map(author => author.name);
  const links = maybe_wrap(raw.link).map(link => link["$"]);
  const pdf = links.find(link => link.title === "pdf")?.href;
  return {
    id: raw.id,
    updated: new Date(raw.updated),
    published: new Date(raw.published),
    title: raw.title,
    abstract: raw.summary,
    authors,
    pdf,
  };
}

// quick test of get_paper_by_id
// get_paper_by_id('arXiv:1901.01071').then(console.log);