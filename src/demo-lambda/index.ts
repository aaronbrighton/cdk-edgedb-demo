import { 
    APIGatewayProxyEvent, 
    APIGatewayProxyResult 
} from "aws-lambda";

const AWS = require('aws-sdk');
const edgedb = require("edgedb");
const secretsmanager = new AWS.SecretsManager();

export const handler = async (
    event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {

    const secret = await secretsmanager.getSecretValue({SecretId: process.env.DATABASE_SECRET}).promise();
    const client = edgedb.createClient({
        dsn: JSON.parse(secret.SecretString).dsn,//`edgedb://edgedb:${secret.SecretString}@${process.env.DATABASE_HOST}:5656/edgedb`,
    });

    const query = `update Counter set { count := .count+1 };`;
    await client.query(query)

    const query2 = `select Counter { count };`;
    const result2 = await client.query(query2)

    return {
        statusCode: 200,
        body: JSON.stringify(result2),
    }
}