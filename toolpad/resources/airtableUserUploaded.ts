/**
 * Toolpad data provider file.
 * See: https://mui.com/toolpad/concepts/data-providers/
 */

import { createDataProvider } from "@mui/toolpad/server";

export default createDataProvider({
  paginationMode: "cursor",
  async getRecords({ paginationModel: { cursor, pageSize } }) {
    let url = new URL(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE}/Listings`
    );
    let params = new URLSearchParams({
      view: process.env.AIRTABLE_VIEW || "Grid view",
    });
    if (cursor) {
      params.append("offset", cursor);
    }
    if (pageSize) {
      params.append("pageSize", pageSize.toString());
    }
    url.search = params.toString();
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`,
      },
    }).then((res) => res.json());

    return {
      records: response.records.map((record) => ({
        id: record.id,
        projectName: record.fields["Project name"],
        createdTime: record.createdTime,
        uploadImages: record.fields["Upload image(s)"],
        file: record.fields["File (from Images)"],
      })),
      cursor: response.offset ?? null,
      totalCount: 100,
    };
  },
});
