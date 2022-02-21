/* Broadly based on https://github.com/eliorav/arXiv-api/blob/master/src/index.js
but typescript and no known security issues */

var xml2js = require('xml2js');

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


/*
{
    "id": "http://arxiv.org/abs/2005.11401v4",
    "updated": "2021-04-12T15:42:18Z",
    "published": "2020-05-22T21:34:34Z",
    "title": "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks",
    "summary": "  Large pre-trained language models have been shown to store factual knowledge\nin their parameters, and achieve state-of-the-art results when fine-tuned on\ndownstream NLP tasks. However, their ability to access and precisely manipulate\nknowledge is still limited, and hence on knowledge-intensive tasks, their\nperformance lags behind task-specific architectures. Additionally, providing\nprovenance for their decisions and updating their world knowledge remain open\nresearch problems. Pre-trained models with a differentiable access mechanism to\nexplicit non-parametric memory can overcome this issue, but have so far been\nonly investigated for extractive downstream tasks. We explore a general-purpose\nfine-tuning recipe for retrieval-augmented generation (RAG) -- models which\ncombine pre-trained parametric and non-parametric memory for language\ngeneration. We introduce RAG models where the parametric memory is a\npre-trained seq2seq model and the non-parametric memory is a dense vector index\nof Wikipedia, accessed with a pre-trained neural retriever. We compare two RAG\nformulations, one which conditions on the same retrieved passages across the\nwhole generated sequence, the other can use different passages per token. We\nfine-tune and evaluate our models on a wide range of knowledge-intensive NLP\ntasks and set the state-of-the-art on three open domain QA tasks, outperforming\nparametric seq2seq models and task-specific retrieve-and-extract architectures.\nFor language generation tasks, we find that RAG models generate more specific,\ndiverse and factual language than a state-of-the-art parametric-only seq2seq\nbaseline.\n",
    "author": [
        {
            "name": "Patrick Lewis"
        },
        {
            "name": "Ethan Perez"
        },
        {
            "name": "Aleksandra Piktus"
        },
        {
            "name": "Fabio Petroni"
        },
        {
            "name": "Vladimir Karpukhin"
        },
        {
            "name": "Naman Goyal"
        },
        {
            "name": "Heinrich Küttler"
        },
        {
            "name": "Mike Lewis"
        },
        {
            "name": "Wen-tau Yih"
        },
        {
            "name": "Tim Rocktäschel"
        },
        {
            "name": "Sebastian Riedel"
        },
        {
            "name": "Douwe Kiela"
        }
    ],
    "arxiv:comment": {
        "_": "Accepted at NeurIPS 2020",
        "$": {
            "xmlns:arxiv": "http://arxiv.org/schemas/atom"
        }
    },
    "link": [
        {
            "$": {
                "href": "http://arxiv.org/abs/2005.11401v4",
                "rel": "alternate",
                "type": "text/html"
            }
        },
        {
            "$": {
                "title": "pdf",
                "href": "http://arxiv.org/pdf/2005.11401v4",
                "rel": "related",
                "type": "application/pdf"
            }
        }
    ],
    "arxiv:primary_category": {
        "$": {
            "xmlns:arxiv": "http://arxiv.org/schemas/atom",
            "term": "cs.CL",
            "scheme": "http://arxiv.org/schemas/atom"
        }
    },
    "category": [
        {
            "$": {
                "term": "cs.CL",
                "scheme": "http://arxiv.org/schemas/atom"
            }
        },
        {
            "$": {
                "term": "cs.LG",
                "scheme": "http://arxiv.org/schemas/atom"
            }
        }
    ]
}
 */

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

function article_from_raw(raw: RawArticle): Article {
  console.log(raw)
  const authors = maybe_wrap(raw.author).map(author => author.name);
  const links = maybe_wrap(raw.link).map(link => link["$"]);
  console.log(links)
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