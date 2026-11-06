// Resident Advisor – inoffizielle GraphQL-Schnittstelle (die auch ra.co selbst nutzt).
// Bitte sparsam verwenden (1x täglich reicht völlig).

const ENDPOINT = 'https://ra.co/graphql';

const QUERY = `query GetEvents($filters: FilterInputDtoInput, $pageSize: Int, $page: Int) {
  eventListings(filters: $filters, pageSize: $pageSize, page: $page) {
    totalResults
    data {
      id
      listingDate
      event {
        id
        title
        date
        startTime
        endTime
        contentUrl
        flyerFront
        content
        genres { name }
        venue {
          id
          name
          address
          contentUrl
          location { latitude longitude }
        }
        artists { id name contentUrl }
      }
    }
  }
}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gql(variables, attempt = 1) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Origin: 'https://ra.co',
      Referer: 'https://ra.co/events/de/munich',
    },
    body: JSON.stringify({ query: QUERY, variables }),
  });
  if (!res.ok) {
    if (attempt < 3) {
      await sleep(2000 * attempt);
      return gql(variables, attempt + 1);
    }
    throw new Error(`RA HTTP ${res.status}`);
  }
  const json = await res.json();
  if (json.errors?.length) throw new Error(`RA GraphQL: ${json.errors[0].message}`);
  return json.data.eventListings;
}

/** Holt alle Events einer Area in einem Datumsbereich (YYYY-MM-DD). */
export async function fetchAreaEvents(areaId, from, to) {
  const pageSize = 50;
  const out = [];
  for (let page = 1; page <= 40; page++) {
    const res = await gql({
      filters: { areas: { eq: areaId }, listingDate: { gte: from, lte: to } },
      pageSize,
      page,
    });
    out.push(...res.data);
    if (res.data.length < pageSize || out.length >= res.totalResults) break;
    await sleep(600);
  }
  return out;
}
