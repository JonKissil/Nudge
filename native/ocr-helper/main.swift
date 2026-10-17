import Foundation
import Vision
import ImageIO

// '-' accepts image bytes on stdin so captured pixels never need a temporary file.
struct TextBox: Encodable {
    let text: String
    let x: Double
    let y: Double
    let w: Double
    let h: Double
}

do {
    guard CommandLine.arguments.count == 2 else {
        throw NSError(domain: "NudgeOCR", code: 1)
    }
    let input = CommandLine.arguments[1]
    let data = input == "-" ? FileHandle.standardInput.readDataToEndOfFile() : try Data(contentsOf: URL(fileURLWithPath: input))
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    try VNImageRequestHandler(data: data, options: [:]).perform([request])
    let boxes = (request.results ?? []).compactMap { observation -> TextBox? in
        guard let candidate = observation.topCandidates(1).first else { return nil }
        let box = observation.boundingBox
        let x = max(0, min(1, box.minX)), y = max(0, min(1, 1 - box.minY - box.height))
        return TextBox(text: candidate.string, x: x, y: y, w: min(1 - x, box.width), h: min(1 - y, box.height))
    }
    FileHandle.standardOutput.write(try JSONEncoder().encode(boxes))
} catch {
    FileHandle.standardError.write(Data("Text recognition failed.\n".utf8))
    exit(1)
}
