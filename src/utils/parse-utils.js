import JsonRefs from 'json-refs';
import converter from 'swagger2openapi';

export default async function ProcessSpec(specUrl, sortTags) {
  let jsonParsedSpec; let convertedSpec; let
    resolvedRefSpec;
  const convertOptions = { patch: true, warnOnly: true };
  const resolveOptions = { resolveCirculars: false };
  try {
    if (typeof specUrl === 'string') {
      convertedSpec = await converter.convertUrl(specUrl, convertOptions);
    } else {
      convertedSpec = await converter.convertObj(specUrl, convertOptions);
    }
    resolvedRefSpec = await JsonRefs.resolveRefs(convertedSpec.openapi, resolveOptions);
    jsonParsedSpec = resolvedRefSpec.resolved;
  } catch (err) {
    console.info('%c There was an issue while parsing the spec %o ', 'color:orangered', err);
  }

  const openApiSpec = jsonParsedSpec;
  const methods = ['get', 'put', 'post', 'delete', 'patch', 'options', 'head'];
  const tags = [];
  let totalPathCount = 0;
  // For each path find the tag and push it into the corrosponding tag
  for (const path in openApiSpec.paths) {
    const commonParams = openApiSpec.paths[path].parameters;
    const commonPathProp = {
      summary: openApiSpec.paths[path].summary,
      description: openApiSpec.paths[path].description,
      servers: openApiSpec.paths[path].servers ? openApiSpec.paths[path].servers : [],
      parameters: openApiSpec.paths[path].parameters ? openApiSpec.paths[path].parameters : [],
    };

    methods.forEach((methodName) => {
      let tagObj;
      let tagText;
      let tagDescr;

      if (openApiSpec.paths[path][methodName]) {
        const fullPath = openApiSpec.paths[path][methodName];
        // If path.methods are tagged, else generate it from path
        if (fullPath.tags) {
          tagText = fullPath.tags[0];
          if (openApiSpec.tags) {
            tagDescr = openApiSpec.tags.find((v) => (v.name === tagText));
          }
        } else {
          let firstWordEndIndex = path.indexOf('/', 1);
          if (firstWordEndIndex === -1) {
            firstWordEndIndex = (path.length - 1);
          } else {
            firstWordEndIndex -= 1;
          }
          tagText = path.substr(1, firstWordEndIndex);
        }
        tagObj = tags.find((v) => v.name === tagText);

        if (!tagObj) {
          tagObj = {
            name: tagText,
            description: tagDescr ? tagDescr.description : '',
            paths: [],
          };
          tags.push(tagObj);
        }
        // Generate Path summary and Description if it is missing for a method
        let summary = fullPath.summary ? fullPath.summary : '';
        const description = fullPath.description ? fullPath.description : '';
        if (!summary && description) {
          if (description.length > 100) {
            let charIndex = -1;
            charIndex = description.indexOf('\n');
            if (charIndex === -1 || charIndex > 100) {
              charIndex = description.indexOf('. ');
            }
            if (charIndex === -1 || charIndex > 100) {
              charIndex = description.indexOf('.');
            }
            if (charIndex === -1 || charIndex > 100) {
              summary = description;
            } else {
              summary = description.substr(0, charIndex);
            }
          } else {
            summary = description;
          }
        }

        // Merge Common Parameters with This methods parameters
        let finalParameters = [];
        if (commonParams) {
          if (fullPath.parameters) {
            finalParameters = commonParams.filter((commonParam) => {
              if (!fullPath.parameters.some((param) => (commonParam.name === param.name && commonParam.in === param.in))) {
                return commonParam;
              }
            }).concat(fullPath.parameters);
          } else {
            finalParameters = commonParams.slice(0);
          }
        } else {
          finalParameters = fullPath.parameters ? fullPath.parameters.slice(0) : [];
        }

        // Update Responses
        tagObj.paths.push({
          summary,
          method: methodName,
          description: fullPath.description,
          path,
          operationId: fullPath.operationId,
          requestBody: fullPath.requestBody,
          parameters: finalParameters,
          servers: fullPath.servers ? commonPathProp.servers.concat(fullPath.servers) : commonPathProp.servers,
          responses: fullPath.responses,
          deprecated: fullPath.deprecated,
          security: fullPath.security,
          commonSummary: commonPathProp.summary,
          commonDescription: commonPathProp.description,
        });
        totalPathCount++;
      }
    }); // End of Methods
  }

  let securitySchemes = {};
  let servers = [];

  securitySchemes = (openApiSpec.components ? openApiSpec.components.securitySchemes : {});
  if (openApiSpec.servers) {
    openApiSpec.servers.map((v) => {
      if (v.url && v.url.substr(0, 1) === '/') {
        const paths = specUrl.split('/');
        v.url = `${paths[0]}//${paths[2]}${v.url}`;
      }
    });
  }
  servers = openApiSpec.servers;
  if (sortTags) {
    tags.sort((a, b) => (a.name < b.name ? -1 : (a.name > b.name ? 1 : 0)));
  }
  const parsedSpec = {
    info: openApiSpec.info,
    tags,
    externalDocs: openApiSpec.externalDocs,
    securitySchemes,
    servers, // In swagger 2, its generated from schemes, host and basePath properties
    basePath: openApiSpec.basePath, // Only available in swagger V2
    totalPathCount,
  };
  return parsedSpec;
}
