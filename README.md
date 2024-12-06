# AWS License Plate Ticket Processor 
## Introduction
This is all the code of the AWS License Plate Processor and did not include any EventBridge, SQS, and more AWS application settings but I will discribe the workflow of this project.
## Workflow of this project
- We first start with an image uploaded to the exe version of the UploadData.js which will upload the license plate image to the selected S3 bucket.
- Then the lambda function PlateReader will use the AWS RekognitionClient to read the license plate number and identify if the license plate belongs to the state of California.
- If the license plate if from California then the lambda function will send the plate number to the "DMVServer" using the DownwardQueue. But if the License plate is not from Califonia then it would put the plate number to EventBridge bus for further processing (Not dealing with it in this version of the project)
- In the DMVServer it would look into the database (a .xml formated datasheet that I'm using for this project's purpose) to identify the plate owner and their information and it would send the information using UpwardQueue to send both the Plate number and the owner's information (including their email address).
- The TicketProcessing lambda function will organize the information sent from the UpwardQueue and send out an email using the SQS to the license plate owner to their email.
